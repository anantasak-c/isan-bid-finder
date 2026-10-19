import { syncRss } from "../src/jobs/sync-rss";
console.log(JSON.stringify(await syncRss(process.argv[2]), null, 2));
