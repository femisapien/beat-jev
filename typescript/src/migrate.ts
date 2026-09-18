import { migrate, pool } from "./store";
await migrate();
await pool.end();
console.log("Database ready.");
