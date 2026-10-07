import type { SVGProps } from "react";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleHelp,
  Clock,
  CodeXml,
  Coffee,
  Download,
  Eraser,
  File,
  FileText,
  Folder,
  Globe,
  Image,
  Layers,
  LayoutGrid,
  Link,
  Moon,
  NotebookPen,
  Pause,
  PenLine,
  Pin,
  Play,
  Plus,
  Projector,
  QrCode,
  RectangleHorizontal,
  RefreshCw,
  Repeat,
  ScrollText,
  Search,
  Settings,
  Slash,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Undo2,
  Wrench,
  X,
  House,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { ICON_STROKE } from "../ui/Icon";

/**
 * The names screens already import, now drawn by lucide at Euclide's stroke
 * weight (see ui/Icon.tsx). Sizes come from the caller's className.
 */
type IconProps = SVGProps<SVGSVGElement>;

function glyph(Glyph: LucideIcon) {
  return function GlyphIcon(props: IconProps) {
    return (
      <Glyph size={20} strokeWidth={ICON_STROKE} aria-hidden focusable={false} {...(props as LucideProps)} />
    );
  };
}

export const HomeIcon = glyph(House);
export const BookIcon = glyph(BookOpen);
export const DocIcon = glyph(FileText);
export const ToolIcon = glyph(Wrench);
export const SparkleIcon = glyph(Sparkles);
export const GearIcon = glyph(Settings);
export const PlusIcon = glyph(Plus);
export const SearchIcon = glyph(Search);
export const BellIcon = glyph(Bell);
export const ClockIcon = glyph(Clock);
export const PenIcon = glyph(PenLine);
export const CodeIcon = glyph(CodeXml);
export const NoteIcon = glyph(NotebookPen);
export const PlayIcon = glyph(Play);
export const LinkIcon = glyph(Link);
export const CoffeeIcon = glyph(Coffee);
export const TrashIcon = glyph(Trash2);
export const FileIcon = glyph(File);
export const RefreshIcon = glyph(RefreshCw);
export const CheckIcon = glyph(Check);
export const QrIcon = glyph(QrCode);
export const MoonIcon = glyph(Moon);
export const SunIcon = glyph(Sun);
export const ArrowRightIcon = glyph(ArrowRight);
export const XIcon = glyph(X);
export const HelpIcon = glyph(CircleHelp);
export const DownloadIcon = glyph(Download);
export const UndoIcon = glyph(Undo2);
export const GlobeIcon = glyph(Globe);
export const ImageIcon = glyph(Image);
export const CalendarIcon = glyph(Calendar);
export const CheckCircleIcon = glyph(CircleCheck);
export const FolderIcon = glyph(Folder);
export const GridIcon = glyph(LayoutGrid);
export const DescriptionIcon = glyph(ScrollText);
export const EraserIcon = glyph(Eraser);
export const LineIcon = glyph(Slash);
export const RectIcon = glyph(RectangleHorizontal);
export const EllipseIcon = glyph(Circle);
export const TextIcon = glyph(Type);
export const ProjectorIcon = glyph(Projector);
export const PinIcon = glyph(Pin);
export const PauseIcon = glyph(Pause);
export const ChevronRightIcon = glyph(ChevronRight);
export const ChevronDownIcon = glyph(ChevronDown);
export const ArchiveIcon = glyph(Archive);
export const RepeatIcon = glyph(Repeat);
export const LayersIcon = glyph(Layers);

// Mapper for file kind icons in lists (Documents, Dashboard recents, etc.)
export function FileKindIcon({ kind, className = "w-5 h-5" }: { kind: string; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "board" || kind === "whiteboard") return <PenIcon className={className} />;
  // pdf, doc, sheet, slides, generic file, etc.
  return <DocIcon className={className} />;
}
