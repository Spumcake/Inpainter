import logoMarks from "./assets/logo-marks.svg";

type SuccessProps = {
  error?: string | null;
  onRetry?: () => void;
};

export default function Success({ error = null, onRetry }: SuccessProps) {
  if (error) {
    return (
      <div className="success">
        <img className="success-logo" src={logoMarks} alt="" />
        <p>Could not open Studio</p>
        <p className="signin-error">{error}</p>
        {onRetry ? (
          <button type="button" className="signin-primary success-retry" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="splash">
      <img className="splash-logo" src={logoMarks} alt="" />
      <div className="splash-track" role="status" aria-label="Opening Studio">
        <div className="splash-bar" />
      </div>
      <p className="success-status">Opening Studio</p>
    </div>
  );
}
