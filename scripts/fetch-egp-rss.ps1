param(
  [Parameter(Mandatory)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$Date,
  [ValidatePattern('^\d{4,10}$')][string[]]$AgencyIds = @('2410101'),
  [ValidateSet('deptId','deptsubId')][string]$AgencyParameter = 'deptId',
  [ValidateSet('15','16')][string[]]$Methods = @('15','16'),
  [ValidateSet('D0','D1','D2','W0','W1','W2')][string[]]$AnnouncementTypes = @('D0','D1','D2','W0')
)

# Official RSS discovery only. A publication date does not establish fiscal
# year, and RSS alone cannot establish the deadline or whether bidding is open.
$ErrorActionPreference = 'Stop'
$day = [datetime]::ParseExact($Date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$report = [Collections.Generic.List[object]]::new()
$client = [Net.WebClient]::new()
try {
  foreach ($agencyId in ($AgencyIds | Select-Object -Unique)) {
    foreach ($method in ($Methods | Select-Object -Unique)) {
      foreach ($announcementType in ($AnnouncementTypes | Select-Object -Unique)) {
        $url = 'https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?' +
          "$AgencyParameter=$agencyId&methodId=$method&anounceType=$announcementType&announceDate=$($day.ToString('yyyyMMdd'))"
        try {
          $bytes = $client.DownloadData($url)
          $text = [Text.Encoding]::GetEncoding(874).GetString($bytes)
          $settings = [Xml.XmlReaderSettings]::new()
          $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
          $settings.XmlResolver = $null
          $reader = [Xml.XmlReader]::Create([IO.StringReader]::new($text), $settings)
          try { $xml = [Xml.XmlDocument]::new(); $xml.Load($reader) } finally { $reader.Dispose() }
          if (-not $xml.SelectSingleNode('/rss/channel')) { throw 'Response is not an RSS feed' }
          $nodes = @($xml.SelectNodes('/rss/channel/item'))
          $countNode = $xml.SelectSingleNode('/rss/channel/countbyday')
          $expected = 0
          $countKnown = $null -ne $countNode -and [int]::TryParse($countNode.InnerText, [ref]$expected)
          $items = @($nodes | ForEach-Object {
            [pscustomobject]@{
              projectId = ([string]$_.description -split ',')[0].Trim()
              title = [string]$_.title
              publishedDate = [string]$_.pubDate
              description = [string]$_.description
              sourceUrl = [string]$_.link
            }
          })
          $wrongDate = @($items | Where-Object { $_.publishedDate -ne $Date }).Count -gt 0
          $coverage = if ($wrongDate) { 'date_mismatch' } elseif (-not $countKnown) { 'unknown' } elseif ($expected -gt $nodes.Count) { 'truncated' } elseif ($expected -eq $nodes.Count) { 'complete_for_query' } else { 'count_mismatch' }
          $report.Add([pscustomobject]@{
            sourceUrl=$url; agencyId=$agencyId; date=$Date; method=$method
            announcementType=$announcementType; expectedCount=$(if($countKnown){$expected}else{$null})
            returnedCount=$nodes.Count; coverage=$coverage; items=$items
          })
        } catch {
          # Avoid reporting request internals; this source uses no credentials.
          $report.Add([pscustomobject]@{sourceUrl=$url;coverage='failed';error='RSS request or parsing failed'})
        }
        Start-Sleep -Milliseconds 350
      }
    }
  }
} finally { $client.Dispose() }
[pscustomobject]@{
  fetchedAt=[datetime]::UtcNow.ToString('o')
  purpose='announcement_discovery'
  scope='Only requested agencies and dates; not all Isan agencies or the full fiscal year'
  queries=@($report.ToArray())
} | ConvertTo-Json -Depth 8
if (@($report | Where-Object { $_.coverage -ne 'complete_for_query' }).Count -gt 0) { exit 2 }
