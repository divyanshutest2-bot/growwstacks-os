import Link from 'next/link';

import { initials, avatarBg, relativeTime } from '@/lib/ui';
import {
  ROLE_LABEL,
  USER_STATUS_LABEL,
  USER_STATUS_DOT_VAR,
  formatTime,
} from '@/lib/ui-users';
import type { UserRollup } from '@/lib/types-users';

// UsersTable — Server Component. Ports User.html's team directory .tbl faithfully,
// driven by real v_user_rollup rows: avatar + status-dot overlay, role sub-line,
// email, job title, status, shift, projects, and last active. Each row is
// whole-row clickable via a stretched <Link> over the name cell. EVERY role sees
// this table (users_select USING(true) — no dev-wall).
//
// "Last active" has no dedicated column in v_user_rollup; we surface updated_at
// (the latest profile mutation) as the closest honest signal rather than fake it.
export function UsersTable({ users }: { users: UserRollup[] }) {
  return (
    <div className="tbl-wrap">
      <table data-testid="users-table" className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Job title</th>
            <th>Status</th>
            <th>Shift</th>
            <th className="num">Projects</th>
            <th className="num">Last active</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isLeft = u.status === 'left_org';
            const dot = USER_STATUS_DOT_VAR[u.status] ?? 'var(--color-status-active)';
            const projCount = u.project_count ?? 0;
            const shift =
              u.shift_start && u.shift_end
                ? `${formatTime(u.shift_start)}–${formatTime(u.shift_end)}`
                : '—';

            return (
              <tr key={u.id} data-testid="user-row" style={{ position: 'relative' }}>
                {/* Name + status-dot overlay + role sub-line */}
                <td>
                  <div className="cell-name" style={isLeft ? { opacity: 0.6 } : undefined}>
                    <span className="wrap" style={{ position: 'relative', display: 'inline-block' }}>
                      <span className="avatar" style={{ background: avatarBg(u.id) }}>
                        {initials(u.full_name ?? u.email)}
                      </span>
                      <span
                        style={{
                          position: 'absolute',
                          bottom: -1,
                          right: -1,
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: dot,
                          boxShadow: '0 0 0 2px var(--color-bg-surface)',
                        }}
                      />
                    </span>
                    <div>
                      <div className="nm">
                        <Link
                          href={`/users/${u.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {u.full_name ?? u.email}
                        </Link>
                      </div>
                      <div className="co">
                        <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                          {u.display_id}
                        </span>{' '}
                        · {ROLE_LABEL[u.role] ?? u.role}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Email */}
                <td style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{u.email}</td>

                {/* Job title */}
                <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {u.job_title ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                </td>

                {/* Status */}
                <td>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      color: isLeft
                        ? 'var(--color-text-tertiary)'
                        : 'var(--color-text-secondary)',
                    }}
                  >
                    <span
                      style={{ width: 8, height: 8, borderRadius: '50%', background: dot }}
                    />
                    {USER_STATUS_LABEL[u.status] ?? u.status}
                  </span>
                </td>

                {/* Shift */}
                <td
                  className="mono"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}
                >
                  {shift}
                </td>

                {/* Projects */}
                <td className="num">
                  {projCount > 0 ? (
                    <span className="mono" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                      {projCount}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                  )}
                </td>

                {/* Last active (updated_at) */}
                <td
                  className="num"
                  style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
                >
                  {relativeTime(u.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
