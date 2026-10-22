# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores the address, the username and the password of
scanservjs in the Gladys configuration (the password as a secret field), and
in `/data` only the time of the newest file announced and the pages counted
of the last files. It talks to scanservjs on your network only (HTTP Basic
authentication when scanservjs has users, redirects not followed), and
never logs the password. It can start scans and, when allowed in its
configuration, delete the newest file of scanservjs.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and scanservjs, SANE and the scanners the integration talks to.
