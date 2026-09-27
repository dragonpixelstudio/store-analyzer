const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config=playwright.domain.config.ts','tests/billing-redis.spec.ts'],{stdio:'inherit',env:{...process.env,RUN_REDIS_BILLING_TESTS:'1'},windowsHide:true});
process.exit(result.status ?? 1);
