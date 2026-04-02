import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { cn } from '../lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { to: '/listings', label: 'Listings', icon: '🐾', roles: ['shopper', 'vendor', 'admin'] },
  { to: '/conversations', label: 'Conversations', icon: '💬', roles: ['shopper', 'vendor', 'admin'] },
  { to: '/admin/settlements', label: 'Settlements', icon: '💰', roles: ['admin', 'vendor', 'ops_reviewer', 'finance_admin'] },
  { to: '/admin/config', label: 'Config', icon: '⚙️', roles: ['admin'] },
  { to: '/admin/audit', label: 'Audit Logs', icon: '📋', roles: ['admin'] },
  { to: '/admin/exports', label: 'Exports', icon: '📦', roles: ['admin'] },
  { to: '/admin/query', label: 'Power Query', icon: '🔍', roles: ['admin', 'vendor'] },
];

export default function Sidebar() {
  const { role, user, logout } = useAuthStore();
  const visible = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <aside className="w-60 flex-shrink-0 bg-[hsl(222,47%,11%)] text-white flex flex-col">
      <div className="p-5 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">PetMarket</h1>
        {user && (
          <p className="text-xs text-white/50 mt-1">
            {user.username} &middot; <span className="capitalize">{role}</span>
          </p>
        )}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full text-left text-sm text-white/50 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
