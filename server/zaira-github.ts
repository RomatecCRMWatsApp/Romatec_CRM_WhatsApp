// Wrapper minimo da GitHub API pra Zaira: status do repo, issues abertas e
// workflows recentes. Usa axios direto (sem @octokit/rest pra evitar dep).
// Token vem de GITHUB_TOKEN; sem token, falha graciosamente.

import axios from "axios";
import { ENV } from "./_core/env";

const API = "https://api.github.com";

function headers() {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (ENV.githubToken) h.Authorization = `Bearer ${ENV.githubToken}`;
  return h;
}

export async function getRepoStatus(): Promise<{
  ok: boolean;
  data?: { fullName: string; defaultBranch: string; openIssues: number; pushedAt: string; size: number; stars: number };
  error?: string;
}> {
  if (!ENV.githubToken) return { ok: false, error: "GITHUB_TOKEN nao configurado" };
  try {
    const url = `${API}/repos/${ENV.githubOwner}/${ENV.githubRepo}`;
    const { data } = await axios.get(url, { headers: headers(), timeout: 10000 });
    return {
      ok: true,
      data: {
        fullName: data.full_name,
        defaultBranch: data.default_branch,
        openIssues: data.open_issues_count,
        pushedAt: data.pushed_at,
        size: data.size,
        stars: data.stargazers_count,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.message || e?.message || "Erro GitHub" };
  }
}

export async function getOpenIssues(limit = 10): Promise<{
  ok: boolean;
  issues?: Array<{ number: number; title: string; user: string; createdAt: string; labels: string[] }>;
  error?: string;
}> {
  if (!ENV.githubToken) return { ok: false, error: "GITHUB_TOKEN nao configurado" };
  try {
    const url = `${API}/repos/${ENV.githubOwner}/${ENV.githubRepo}/issues?state=open&per_page=${limit}`;
    const { data } = await axios.get(url, { headers: headers(), timeout: 10000 });
    const issues = (data ?? [])
      .filter((i: any) => !i.pull_request)
      .map((i: any) => ({
        number: i.number,
        title: i.title,
        user: i.user?.login ?? "?",
        createdAt: i.created_at,
        labels: (i.labels ?? []).map((l: any) => l.name ?? l),
      }));
    return { ok: true, issues };
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.message || e?.message || "Erro GitHub" };
  }
}

export async function getRecentWorkflows(limit = 10): Promise<{
  ok: boolean;
  runs?: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    branch: string;
    createdAt: string;
    htmlUrl: string;
  }>;
  error?: string;
}> {
  if (!ENV.githubToken) return { ok: false, error: "GITHUB_TOKEN nao configurado" };
  try {
    const url = `${API}/repos/${ENV.githubOwner}/${ENV.githubRepo}/actions/runs?per_page=${limit}`;
    const { data } = await axios.get(url, { headers: headers(), timeout: 10000 });
    const runs = (data?.workflow_runs ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? r.display_title,
      status: r.status,
      conclusion: r.conclusion,
      branch: r.head_branch,
      createdAt: r.created_at,
      htmlUrl: r.html_url,
    }));
    return { ok: true, runs };
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.message || e?.message || "Erro GitHub" };
  }
}
