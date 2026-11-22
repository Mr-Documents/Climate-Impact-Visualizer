import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('renders the climate portfolio dashboard and theme toggle', () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /good morning, ramzy/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /emissions/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /log in|sign up/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));
  expect(document.querySelector(".workspace-shell")).toHaveAttribute("data-theme", "light");
});
