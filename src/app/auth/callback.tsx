import { Redirect } from 'expo-router';

// Root Linking handlers exchange the code; never render or log callback credentials.
export default function AuthCallbackScreen() {
  return <Redirect href="/account" />;
}
