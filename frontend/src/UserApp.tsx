import Home from "./components/user-dashboard/Home";

// Temporary standalone entry for previewing the user-facing home dashboard
// in isolation. Once routing / auth is wired up (see welcome-auth-flow),
// this will be replaced by a route rendering `Home` instead.
export default function UserApp() {
  return <Home />;
}
