import { supabase } from "./src/integrations/supabase/client";

async function testSignup() {
  const testEmail = `test_final_${Math.random().toString(36).substring(7)}@example.com`;
  const testPassword = 'XyZ7!9qR2#vB8wL' + Math.random().toString(36).substring(2);

  console.log('--- SIGNUP TEST START ---');
  console.log('Target URL:', import.meta.env.VITE_SUPABASE_URL);

  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });

  if (error) {
    console.log('FAIL:', error.message);
  } else {
    console.log('SUCCESS');
    console.log('User ID:', data.user?.id);
    console.log('Session present:', !!data.session);
  }
}
testSignup();
