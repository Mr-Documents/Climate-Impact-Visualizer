import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the climate dashboard without authentication actions', () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /at a glance/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /log in|sign up/i })).not.toBeInTheDocument();
});
