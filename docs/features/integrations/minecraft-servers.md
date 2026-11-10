# Minecraft servers / Minecraft 伺服器

**Repository tools → Minecraft servers** keeps the Minecraft servers you run on
this computer in one place: the EULA step, a start and stop switch, and a live
console with a command line.

「Repository tools → Minecraft servers」將你喺呢部機開嘅 Minecraft 伺服器放埋一齊：
先處理 EULA，再有開關掣，同埋一個即時主控台連指令列。

> [!IMPORTANT]
> Nothing is downloaded for you. You bring the server folder, the server jar and
> Java. A server never starts until you have accepted the
> [Minecraft EULA](https://aka.ms/MinecraftEULA) for that folder yourself.

## What it does

| Step | Behaviour |
| --- | --- |
| Add a server | Name, server folder (full path), jar file name, Java (`java` or a full path), memory in MB (512 to 65536) and port (1024 to 65535). Every problem is listed, not only the first. |
| EULA | Shown until `eula.txt` in the folder says `eula=true`. Tick the box, then **Accept for this server** writes that file with the date. The app never ticks it for you. |
| Start | Runs `java -Xmx<memory>M -jar <jar> nogui` in the server folder, with no shell and a short allow-list of environment names, so tokens and other secrets are not handed to the server. |
| Status | Starting until the server prints its `Done (…s)!` line, then Running. A server that exits by itself is shown as stopped unexpectedly with the exit code. |
| Console | The last 2,000 complete lines, refreshed once a second. |
| Command | One line of at most 256 characters, sent to the running server. A leading `/` is removed. |
| Stop | Sends `stop` so the world is saved; the process is ended only if it has not exited after 20 seconds. |
| Settings | Ten `server.properties` values (message of the day, maximum players, difficulty, game mode, PvP, allow-list, hardcore, flight, view distance, spawn protection), each checked. Nothing else in the file can be written. |
| Backups | **Back up world** copies the world folder into `backups/<world>-<UTC time>/`. Only while the server is stopped; at most 50. |
| Plugins and mods | The jar files in `plugins/` and `mods/`, read-only. |
| Remove from list | Forgets the entry. The folder and the world are never deleted. |

Servers that are still running are asked to stop when the app closes.

## Checks

- A running server cannot be changed or removed from the list.
- A missing jar is reported instead of starting Java.
- The list holds at most 50 servers and is stored in the app's own data folder.
- Every rule is enforced in the privileged process, not only in the window.

## Not built

Downloading server jars, world generation, restoring or deleting backups, and
installing plugins.

The web panel, its free public link and the Discord webhook are described in
[Minecraft web panel, free public link and Discord webhook](web-panel-public-link.md).

## Verification

Unit tests cover the rules, the host with a stand-in Java process, and the
screen with a stand-in client. It has not been run against a real Minecraft
server jar.
