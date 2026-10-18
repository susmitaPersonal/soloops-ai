import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Alert } from './Alert';
import { Button } from './Button';
import { ErrorSummary } from './ErrorSummary';
import { TextField } from './TextField';

describe('TextField (design system §7.2, A11Y-003)', () => {
  it('CT-TXT-01 label, hint and error are programmatically associated', () => {
    render(
      <TextField id="f" label="Tax label" hint="For example GST" error="Tax label is required." />,
    );
    const input = screen.getByLabelText('Tax label');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('For example GST Tax label is required.');
  });

  it('CT-TXT-02 required fields say "(required)" in text, not only an asterisk', () => {
    render(<TextField label="Email" required />);
    expect(screen.getByLabelText(/Email \(required\)/)).toBeRequired();
  });

  it('CT-TXT-03 valid fields are not marked invalid and have no stray description', () => {
    render(<TextField label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('Button (design system §7.1)', () => {
  it('CT-BTN-01 loading keeps the label, sets aria-busy and blocks double submit', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save settings
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save settings' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('CT-BTN-02 A11Y-002 keyboard activation with Enter and Space', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Go' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe('Alert (design system §7.13, A11Y-004)', () => {
  it('CT-ALR-01 only errors use role="alert"; tone is conveyed by title text, not colour alone', () => {
    const { rerender } = render(<Alert tone="error" title="Couldn't save settings" />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save settings");
    for (const tone of ['info', 'success', 'warning', 'permission'] as const) {
      rerender(<Alert tone={tone} title={`${tone} title`} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText(`${tone} title`)).toBeInTheDocument();
    }
  });

  it('CT-ALR-02 renders an optional action', () => {
    render(<Alert tone="warning" title="Changed" action={<button type="button">Reload</button>} />);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

describe('ErrorSummary (A11Y-003)', () => {
  it('CT-ERS-01 receives focus and its links move focus to the field', async () => {
    render(
      <>
        <ErrorSummary
          items={[
            { fieldId: 'email', message: 'Enter a valid email address.' },
            { message: 'Form-level problem' },
          ]}
        />
        <label htmlFor="email">Email</label>
        <input id="email" />
      </>,
    );
    expect(screen.getByRole('alert', { name: 'There is a problem' })).toHaveFocus();
    expect(screen.getByText('Form-level problem')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Enter a valid email address.' }));
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('CT-ERS-02 renders nothing when there are no errors', () => {
    const { container } = render(<ErrorSummary items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
