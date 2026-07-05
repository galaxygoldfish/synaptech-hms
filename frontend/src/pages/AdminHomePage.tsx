import '../styles.css'
import { useEffect, useMemo, useState } from "react";
import { useAuth } from '../context/AuthContext'
import { fetchActions, fetchDashboard } from "../api";
import { ActionList } from "../components/admin-dashboard/ActionList";
import { Header } from "../components/admin-dashboard/Header";
import { ProfileModal } from "../components/admin-dashboard/ProfileModal";
import { SearchBar } from "../components/admin-dashboard/SearchBar";
import { StatCards } from "../components/admin-dashboard/StatCards";
import type { ActionGroup, DashboardStats, UserProfile } from "../types";

export default function AdminHomePage() {
  const { signOut } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allGroups, setAllGroups] = useState<ActionGroup[]>([]);
  const [searchResults, setSearchResults] = useState<ActionGroup[]>([]);
  const [query, setQuery] = useState("");
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchDashboard(), fetchActions()])
      .then(([dashboard, actions]) => {
        if (cancelled) return;
        setStats(dashboard.stats);
        setUser(dashboard.user);
        setAllGroups(actions.groups);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the dashboard. Check that the API server is running.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      fetchActions(trimmed)
        .then((res) => {
          if (!cancelled) setSearchResults(res.groups);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const isSearching = query.trim().length > 0;
  const visibleGroups = useMemo(
    () => (isSearching ? searchResults : allGroups),
    [isSearching, searchResults, allGroups]
  );

  const handleAction = (actionId: string) => {
    // Placeholder: wire this up to routing / real screens as they're built.
    // eslint-disable-next-line no-console
    console.log("Navigate to action:", actionId);
  };

  const handleLogOut = () => {
    setProfileOpen(false);
    signOut();
  };

  if (isLoading) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !stats || !user) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text status-text--error">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header userName={user.name} onProfileClick={() => setProfileOpen(true)} />

      <main className="app-main">
        {!isSearching && <StatCards stats={stats} />}

        <SearchBar value={query} onChange={setQuery} />

        <div className="app-main__body">
          <ActionList
            groups={visibleGroups}
            showCategoryLabels={!isSearching}
            onSelect={handleAction}
          />
        </div>
      </main>

      {isProfileOpen && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  );
}
