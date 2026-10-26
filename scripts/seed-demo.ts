/** Load labelled demo data (channel "demo") for presenting the dashboard. `npm run seed:demo` */
import { seedDemo } from "../src/lib/demo/seed";
import { db } from "../src/lib/db";
import { LocalStore } from "../src/lib/db/local";

seedDemo()
  .then((r) => {
    const s = db();
    if (s instanceof LocalStore) s.flush();
    console.log(`Seeded ${r.users} demo users. They appear only under the "Demo" source and are labelled as demo data.`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
