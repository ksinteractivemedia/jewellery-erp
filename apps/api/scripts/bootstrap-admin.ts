import { z } from "zod";
import { connectDb, disconnectDb } from "../src/db/connect";
import { bootstrapSuperAdmin } from "../src/modules/auth/bootstrap";

// Creates the first SUPER_ADMIN. Credentials come from the environment so they never land in shell history or the repo.
const env = z
  .object({
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().default("jewellery-erp"),
    BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
    BOOTSTRAP_ADMIN_NAME: z.string().default("Super Admin"),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(10),
  })
  .parse(process.env);

await connectDb(env.MONGODB_URI, env.MONGODB_DB);
const user = await bootstrapSuperAdmin({ email: env.BOOTSTRAP_ADMIN_EMAIL, name: env.BOOTSTRAP_ADMIN_NAME, password: env.BOOTSTRAP_ADMIN_PASSWORD });
console.log(`created SUPER_ADMIN ${user.email}`);
await disconnectDb();
