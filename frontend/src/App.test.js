import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('preserves the climate dashboard and provides the new climate sections', () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /at a glance/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /global climate explorer/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /documentation/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /log in|sign up/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));
  expect(document.querySelector(".workspace-shell")).toHaveAttribute("data-theme", "light");
});
