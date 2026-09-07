import logoMarks from "./assets/logo-marks.svg";

type SignInProps = {
  waiting?: boolean;
  error?: string | null;
  onSignIn?: () => void;
};

export default function SignIn({ waiting = false, error = null, onSignIn }: SignInProps) {
  return (
    <div className="signin">
      <div className="signin-panel">
        <div className="signin-copy">
          <img className="signin-logo" src={logoMarks} alt="Inpainter" />
          <h1 className="signin-title">Welcome to Inpainter</h1>
          <p className="signin-lede">
            Manage Inpainter projects, agent skills, and installations in one app.
          </p>
          <button
            type="button"
            className="signin-primary"
            onClick={onSignIn}
            disabled={waiting}
          >
            {waiting ? "Waiting for browser…" : "Sign in"}
          </button>
          <button type="button" className="signin-secondary">
            Skip
          </button>
          {waiting ? (
            <p className="signin-status">Complete sign-in in your browser, then return here.</p>
          ) : null}
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
