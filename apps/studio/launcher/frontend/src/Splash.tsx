import logoMarks from "./assets/logo-marks.svg";

export default function Splash() {
  return (
    <div className="splash">
      <img className="splash-logo" src={logoMarks} alt="" />
      <div className="splash-track" aria-hidden="true">
        <div className="splash-bar" />
      </div>
    </div>
  );
}
