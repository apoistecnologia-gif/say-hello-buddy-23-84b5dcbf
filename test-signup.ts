import { supabase } from "./src/integrations/supabase/client";

async function testSignup() {
  const testEmail = `test_${Math.random().toString(36).substring(7)}@example.com`;
  const testPassword = 'P@ssw0rd!LongerAndComplex2026';
  const testName = 'Test User';
  const testPhone = '11999999999';

  console.log('--- SIGNUP TEST START ---');
  console.log('Target URL:', import.meta.env.VITE_SUPABASE_URL);
  console.log('Test Email:', testEmail);

  try {
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: testName,
          phone: testPhone,
          role: 'passenger',
        },
      },
    });

    if (error) {
      console.log('FAIL: signUp error');
      console.log('Name:', error.name);
      console.log('Message:', error.message);
      console.log('Status:', error.status);
      console.log('JSON:', JSON.stringify(error, null, 2));
    } else {
      console.log('SUCCESS: signUp data');
      console.log('User ID:', data.user?.id);
      console.log('Session present:', !!data.session);
    }
  } catch (err) {
    console.error('CRITICAL: Unexpected exception', err);
  }
  console.log('--- SIGNUP TEST END ---');
}

testSignup();
