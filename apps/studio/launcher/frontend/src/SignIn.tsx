import logoMarks from "./assets/logo-marks.svg";

type SignInProps = {
  waiting?: boolean;
  error?: string | null;
  onSignIn?: () => void;
  onSkip?: () => void;
};

export default function SignIn({
  waiting = false,
  error = null,
  onSignIn,
  onSkip,
}: SignInProps) {
  return (
    <div className="signin">
      <div className="signin-panel">
        <div className="signin-copy">
          <img className="signin-logo" src={logoMarks} alt="Inpainter" />
          <h1 className="signin-title">Welcome to Inpainter</h1>
          <p className="signin-lede">
            Manage Inpainter projects, agent skills, and installations in one app.
          </p>
          <div className={waiting ? "signin-actions is-waiting" : "signin-actions"}>
            <button
              type="button"
              className="signin-primary"
              onClick={onSignIn}
              disabled={waiting}
            >
              Sign in
            </button>
            <button type="button" className="signin-secondary" onClick={onSkip} disabled={waiting}>
              Skip
            </button>
          </div>
          {error ? <p className="signin-error">{error}</p> : null}
          <p className="signin-footer">
            <span>New to Inpainter? </span>
            <a href="#">Create an account</a>
          </p>
        </div>
      </div>
      <div className="signin-aside">
        <div className="splash-track" role="status" aria-label="Loading">
          <div className="splash-bar" />
        </div>
      </div>
    </div>
  );
}
