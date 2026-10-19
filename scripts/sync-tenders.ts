import { syncTenders } from "../src/jobs/sync-tenders";

const result = await syncTenders();
console.log(JSON.stringify(result));
