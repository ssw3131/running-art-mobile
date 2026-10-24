import { Redirect } from 'expo-router';

// Registered in the protected service group. Unknown guest links fall back to
// account-entry; signed-in users return to home instead of a route directory.
export default function UnknownRoute() { return <Redirect href="/" />; }
