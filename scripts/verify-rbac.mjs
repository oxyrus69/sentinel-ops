/** Verify RBAC route/action rules without a running server. */
const { canAccessRoute, ROLE_HOME, requireRole } = await import('@/server/rbac');

const cases = [
  ['SUPPORT_AGENT', '/vault', false],
  ['SUPPORT_AGENT', '/admin', false],
  ['SUPPORT_AGENT', '/admin/audit', false],
  ['SUPPORT_AGENT', '/dss', false],
  ['SUPPORT_AGENT', '/incidents', true],
  ['SUPPORT_AGENT', '/assets', true],
  ['SUPPORT_AGENT', '/scanner/rules', true],
  ['CLIENT_OWNER', '/portal', true],
  ['CLIENT_OWNER', '/admin', false],
  ['CLIENT_OWNER', '/incidents', false],
  ['CLIENT_OWNER', '/vault', false],
  ['SECOPS_ENGINEER', '/vault', true],
  ['SECOPS_ENGINEER', '/dss', true],
  ['SECOPS_ENGINEER', '/admin/audit', false],
  ['SECOPS_ENGINEER', '/admin/settings', false],
  ['SUPER_ADMIN', '/admin/settings', true],
  ['SUPER_ADMIN', '/vault', true],
  [null, '/login', true],
  [null, '/status/foo', true],
  [null, '/admin', false],
];

let pass = 0;
let fail = 0;

for (const [role, path, expected] of cases) {
  const actual = canAccessRoute(role, String(path));
  const ok = actual === expected;
  if (ok) pass += 1;
  else fail += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${String(role ?? 'publik').padEnd(17)} ${String(path).padEnd(20)} -> ${actual} (harus ${expected})`,
  );
}

console.log('\nROLE_HOME:');
for (const [role, home] of Object.entries(ROLE_HOME)) {
  console.log(`  ${role.padEnd(17)} ${home}`);
}

// Server-action guard behaviour
try {
  requireRole({ id: 'x', role: 'SUPPORT_AGENT' }, ['SUPER_ADMIN', 'SECOPS_ENGINEER']);
  console.log('FAIL requireRole tidak menolak SUPPORT_AGENT untuk vault');
  fail += 1;
} catch (err) {
  console.log('ok   requireRole menolak SUPPORT_AGENT:', err.message.slice(0, 70));
  pass += 1;
}

try {
  requireRole(null, ['SUPER_ADMIN']);
  console.log('FAIL requireRole tidak menolak tamu');
  fail += 1;
} catch {
  console.log('ok   requireRole menolak tamu tanpa sesi');
  pass += 1;
}

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exit(fail > 0 ? 1 : 0);
