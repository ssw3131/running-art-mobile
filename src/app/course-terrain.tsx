import { Redirect } from 'expo-router';

/** Preserve old links without reopening removed terrain UI or sending coordinates. */
export default function RetiredTerrainRoute() { return <Redirect href="/courses" />; }
