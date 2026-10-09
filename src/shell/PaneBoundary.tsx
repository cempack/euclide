import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { EmptyState } from "../components/ui";
import { tr } from "../lib/i18n";
import { describeError, reportLine } from "../lib/report";
import { Icon } from "../ui/Icon";

type Props = {
  children: ReactNode;
  /** What failed, for euclide.log: a tab kind, « scene »… */
  where: string;
  /** Closes what failed: the tab, or the overlay. */
  onClose: () => void;
  /** A layer over the window (the classroom view, the palette), not a pane. */
  overlay?: boolean;
  /** A new value clears the error: the overlay was closed, then opened again. */
  resetKey?: unknown;
};

/**
 * A screen that throws while rendering takes only itself down: its tab (or
 * overlay) says so and offers to try again or close; the other tabs keep
 * their state. The editors it unmounts save what they hold on the way out.
 */
export class PaneBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const component = info.componentStack?.trim().split("\n")[0]?.trim();
    reportLine(`render ${this.props.where} ${describeError(error)}${component ? ` in ${component}` : ""}`);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const { overlay, onClose } = this.props;
    const notice = (
      <EmptyState
        icon={<Icon icon={CircleAlert} size={16} />}
        title={overlay ? tr("app.overlayError") : tr("app.paneError")}
        hint={tr("app.paneErrorHint")}
        action={
          <>
            <button className="eu-btn-ghost eu-btn-sm" onClick={this.retry}>
              {tr("app.paneRetry")}
            </button>
            <button className="eu-btn-quiet eu-btn-sm" onClick={onClose}>
              {overlay ? tr("common.close") : tr("app.paneClose")}
            </button>
          </>
        }
      />
    );
    return overlay ? (
      <div className="fixed inset-0 z-confirm grid place-items-center bg-canvas p-6" role="alert">
        <div className="eu-panel shadow-pop max-w-[480px]">{notice}</div>
      </div>
    ) : (
      <div className="eu-page" role="alert">
        {notice}
      </div>
    );
  }
}
