/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EnvironmentBlock } from '../EnvironmentBlock';
import type { RoundEnvironment } from '../../../../types';

afterEach(() => {
  cleanup();
});

describe('EnvironmentBlock', () => {
  it('renders 3 rows and roundCount + 1 columns', () => {
    const { container } = render(<EnvironmentBlock roundCount={3} value={[]} />);
    const rows = container.querySelectorAll('tbody > tr');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.children).toHaveLength(4); // row label + 3 rounds
    });
  });

  it('labels the three rows Round / Temperature (°C) / %RH', () => {
    const { container } = render(<EnvironmentBlock roundCount={2} value={[]} />);
    const rows = container.querySelectorAll('tbody > tr');
    expect(rows[0].children[0].textContent).toBe('Round');
    expect(rows[1].children[0].textContent).toBe('Temperature (°C)');
    expect(rows[2].children[0].textContent).toBe('%RH');
  });

  it('typing in a temperature cell calls onChange with the right roundIndex', () => {
    const initial: RoundEnvironment[] = [{ roundIndex: 2, temperatureC: 20, relativeHumidity: 48 }];
    const onChange = vi.fn();
    render(<EnvironmentBlock roundCount={2} value={initial} onChange={onChange} />);

    const tempInput = screen.getByLabelText('Round 2 temperature');
    fireEvent.change(tempInput, { target: { value: '25.5' } });

    expect(onChange).toHaveBeenCalledWith([{ roundIndex: 2, temperatureC: 25.5, relativeHumidity: 48 }]);
  });

  it('typing in a relative humidity cell calls onChange with the right roundIndex', () => {
    const initial: RoundEnvironment[] = [{ roundIndex: 1, temperatureC: 21, relativeHumidity: 50 }];
    const onChange = vi.fn();
    render(<EnvironmentBlock roundCount={1} value={initial} onChange={onChange} />);

    const rhInput = screen.getByLabelText('Round 1 relative humidity');
    fireEvent.change(rhInput, { target: { value: '55' } });

    expect(onChange).toHaveBeenCalledWith([{ roundIndex: 1, temperatureC: 21, relativeHumidity: 55 }]);
  });

  it('isReadOnly disables every input', () => {
    render(<EnvironmentBlock roundCount={3} value={[]} isReadOnly />);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs).toHaveLength(6); // 3 rounds x (temperature + RH)
    inputs.forEach((input) => expect(input.disabled).toBe(true));
  });

  it('roundCount 0 renders nothing', () => {
    const { container } = render(<EnvironmentBlock roundCount={0} value={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('roundCount 10 still renders all 11 columns', () => {
    const { container } = render(<EnvironmentBlock roundCount={10} value={[]} />);
    const rows = container.querySelectorAll('tbody > tr');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.children).toHaveLength(11); // row label + 10 rounds
    });
    expect(screen.getAllByRole('spinbutton')).toHaveLength(20); // 10 rounds x 2 fields
  });

  it('roundCount 1 renders a single round column', () => {
    const { container } = render(<EnvironmentBlock roundCount={1} value={[]} />);
    const rows = container.querySelectorAll('tbody > tr');
    rows.forEach((row) => {
      expect(row.children).toHaveLength(2); // row label + 1 round
    });
  });
});
