# Security policy

## Supported versions

Security fixes are applied to the **latest minor release** on the default branch and backported to the previous release branch when practical. Use the newest tagged release when deploying to users.

## Reporting a vulnerability

Please **do not** file public GitHub issues for undisclosed security vulnerabilities.

Instead, email **security@skinalyze.app** with:

- A short description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- Affected version(s) / commit SHA if known
- Whether you believe the issue is exploitable in the Chrome Web Store build vs. source-only scenarios

We aim to acknowledge receipt within **72 hours** for valid reports and coordinate disclosure.

## Scope

In scope:

- This extension’s **manifest permissions**, **message handlers**, **network calls**, and **token storage** behavior.
- Issues that could lead to **cross-account data access**, **token theft**, or **unexpected exfiltration** of Steam or SkinAlyze data.

Out of scope (examples):

- Steam or Valve infrastructure issues
- Social engineering or phishing unrelated to this codebase
- Generic dependency advisories without a concrete exploit path in this extension

## Safe harbor

If you follow this policy and act in good faith, we will not pursue legal action for accidental, good-faith research.
