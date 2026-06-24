import { env } from "./config/env";
import { pool } from "./config/database";
import app from "./app";

async function start() {
  // Test database connection
  try {
    const result = await pool.query("SELECT NOW()");
    console.log(`✅ Database connected at ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
  } catch (err: any) {
    console.error(`❌ Database connection failed: ${err.message}`);
    console.error(`   Make sure PostgreSQL is running and the database "${env.DB_NAME}" exists.`);
    console.error(`   Run: createdb ${env.DB_NAME}`);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    console.log(`\n🚀 API server running at http://localhost:${env.PORT}`);
    console.log(`   Health check: http://localhost:${env.PORT}/api/health\n`);
    console.log("   Routes:");
    console.log("   GET/POST        /api/consultants");
    console.log("   GET/PUT/DELETE  /api/consultants/:id");
    console.log("   GET             /api/consultants/:id/busy");
    console.log("   GET/POST        /api/projects");
    console.log("   GET/PUT/DELETE  /api/projects/:id");
    console.log("   PUT             /api/projects/:id/allocations");
    console.log("   DELETE          /api/projects/:id/allocations");
    console.log("   POST            /api/simulation/:projectId\n");
  });
}

start();
