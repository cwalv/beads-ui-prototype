import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="not-found" role="main">
      <h1>404</h1>
      <p>We don't know this address.</p>
      <Link to="/author">Go to Author</Link>
    </div>
  );
}
