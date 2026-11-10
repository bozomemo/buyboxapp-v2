import type { LucideIcon } from 'lucide-react';

/**
 * The one place the app imports `lucide-react` (spec 2026-11-03-ui-redesign §4.3; the dependency
 * is an authorised exception to doc 15 rule 9). Every icon in use is re-exported below, so the
 * set the app actually draws is visible in one file, and size and stroke are fixed here rather
 * than chosen per screen. `icon.test.tsx` fails if any other file imports lucide directly.
 *
 * Decorative by default (`aria-hidden`): an icon sits next to a word that already says the
 * thing. Pass `label` only when the icon is the sole carrier of meaning.
 */
export function Icon({
  icon: Glyph,
  size = 16,
  className,
  label,
}: {
  icon: LucideIcon;
  size?: 16 | 18 | 20;
  className?: string;
  label?: string;
}) {
  return label ? (
    <Glyph size={size} strokeWidth={1.8} className={className} role="img" aria-label={label} />
  ) : (
    <Glyph size={size} strokeWidth={1.8} className={className} aria-hidden="true" />
  );
}

export type { LucideIcon };
export {
  AlertTriangle,
  BarChart3,
  Bell,
  Bookmark,
  Calculator,
  Check,
  CheckCircle2,
  Download,
  Cog,
  Eye,
  GitCompare,
  History,
  Inbox,
  Info,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  ScanSearch,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
  Users,
  X,
} from 'lucide-react';
