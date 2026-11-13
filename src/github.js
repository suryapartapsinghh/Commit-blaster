'use strict';

const LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date weekday contributionCount contributionLevel } }
      }
    }
  }
}`;

/** Fetches the last year of contributions for a user via the GitHub GraphQL API. */
async function fetchContributions(username, token) {
  if (!username) throw new Error('A GitHub username is required.');
  if (!token) throw new Error('A GitHub token is required (the default GITHUB_TOKEN works).');

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'commit-blaster',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: username } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(`GitHub API error: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data || !json.data.user) {
    throw new Error(`No GitHub user named "${username}" was found.`);
  }

  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return {
    total: cal.totalContributions,
    weeks: cal.weeks.map((w) =>
      w.contributionDays.map((d) => ({
        date: d.date,
        row: d.weekday,
        count: d.contributionCount,
        level: LEVELS[d.contributionLevel] ?? 0,
      }))
    ),
  };
}

module.exports = { fetchContributions };
