const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
// GitHub rejects requests without a User-Agent.
const USER_AGENT = '4nrry-dev-sync';
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 2_000;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; type?: string }>;
}

async function graphqlOnce<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new GitHubError(
      `GitHub GraphQL HTTP ${response.status}: ${body.slice(0, 300)}`,
      response.status,
      response.status >= 500 || response.status === 429,
    );
  }

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors?.length) {
    const messages = payload.errors.map((e) => e.message).join('; ');
    throw new GitHubError(`GitHub GraphQL errors: ${messages.slice(0, 500)}`, null, false);
  }
  if (payload.data === undefined) {
    throw new GitHubError('GitHub GraphQL returned no data', null, false);
  }
  return payload.data;
}

/** One retry for transient upstream failures (5xx/429); auth errors fail fast. */
export async function graphql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  try {
    return await graphqlOnce<T>(token, query, variables);
  } catch (error) {
    const transient =
      (error instanceof GitHubError && error.retryable) ||
      (error instanceof DOMException && error.name === 'TimeoutError');
    if (!transient) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return graphqlOnce<T>(token, query, variables);
  }
}
