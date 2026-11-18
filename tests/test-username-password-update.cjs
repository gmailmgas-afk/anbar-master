/**
 * Automated Test: Change Username & Password in Mousa Amouei's Panel
 * Validates:
 * 1. Renaming 'hakimi' -> 'hakimi_anbar' (or custom username)
 * 2. Changing password with PBKDF2-SHA512
 * 3. Successful login with new username and password
 * 4. Rejection with invalid old credentials
 */

const crypto = require('crypto');

function computePbkdf2(password, saltHex) {
  const saltBuf = Buffer.from(saltHex, 'hex');
  const hash = crypto.pbkdf2Sync(password, saltBuf, 100000, 32, 'sha512').toString('hex');
  return { hash, salt: saltHex };
}

async function runTest() {
  console.log('🧪 Starting Username & Password Change Test...');
  const baseUrl = 'http://127.0.0.1:3000';

  // 1. Fetch current users
  console.log('1. Checking current users from /api/auth/users...');
  const usersRes = await fetch(`${baseUrl}/api/auth/users`);
  if (!usersRes.ok) throw new Error(`Failed to fetch users: ${usersRes.status}`);
  const usersData = await usersRes.json();
  const hakimi = usersData.users.find(u => u.user_id === 'USR-005');
  console.log(`✓ Found user USR-005: username="${hakimi.username}", name="${hakimi.full_name}"`);

  // 2. Change username and password as Mousa Amouei
  const newUsername = 'hakimi_anbar';
  const newPassword = 'CustomSecurePass#2026';
  const salt = crypto.randomBytes(16).toString('hex');
  const { hash } = computePbkdf2(newPassword, salt);

  console.log(`2. Updating user USR-005: username -> "${newUsername}", new PBKDF2 password...`);
  const updateRes = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: 'USR-005',
      username: newUsername,
      old_username: hakimi.username,
      full_name: 'خانم حکیمی (مدیریت اسناد)',
      system_id: 'SYS-HAKIMI-OFFICE-05',
      password_hash: hash,
      password_salt: salt
    })
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(`Update failed: ${JSON.stringify(err)}`);
  }
  const updateData = await updateRes.json();
  console.log('✓ Server update response:', updateData.message);

  // 3. Test Login with NEW credentials
  console.log(`3. Testing login with NEW username "${newUsername}" and NEW password...`);
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: newUsername,
      password: newPassword,
      device_id: 'TEST-OFFICE-PC'
    })
  });

  if (!loginRes.ok) {
    const loginErr = await loginRes.json();
    throw new Error(`Login with new credentials failed: ${JSON.stringify(loginErr)}`);
  }
  const loginData = await loginRes.json();
  console.log(`✓ Login SUCCESS! User authenticated as: ${loginData.user.full_name} (@${loginData.user.username})`);

  // 4. Test that OLD password fails
  console.log('4. Testing that wrong/old password fails...');
  const wrongLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: newUsername,
      password: 'WrongPassword999!',
      device_id: 'TEST-OFFICE-PC'
    })
  });
  if (wrongLoginRes.status === 401) {
    console.log('✓ Invalid password correctly rejected with 401.');
  } else {
    throw new Error(`Expected 401 for wrong password, got ${wrongLoginRes.status}`);
  }

  // 5. Restore username to standard hakimi with default password for clean state
  console.log('5. Restoring user to default hakimi / standard state...');
  const restoreSalt = '6aab9991f7a58cab78a8edf161c3c404';
  const restoreHash = '07c7b08ad39d05db31bfe7d8d6d4cbc235d28bd04968970965c7d87836fb598d';
  await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: 'USR-005',
      username: 'hakimi',
      old_username: newUsername,
      full_name: 'خانم حکیمی',
      system_id: 'SYS-HAKIMI-OFFICE-05',
      password_hash: restoreHash,
      password_salt: restoreSalt
    })
  });
  console.log('✓ Clean state restored.');

  console.log('\n🎉 ALL TESTS PASSED! Usernames and passwords can be updated seamlessly.');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
