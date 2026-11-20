# Proto Fleet

## Documentation

- [Proto Fleet overview](https://docs.proto.xyz/fleet/home/proto-fleet) ([source](https://docs.proto.xyz/fleet/home/proto-fleet.md)) — what Proto Fleet does, and which miners and firmware it supports.
- [Fleet User Guide](https://docs.proto.xyz/fleet/user-guide) ([source](https://docs.proto.xyz/fleet/user-guide.md)) — the dashboard, miners, groups, racks, mining pools, team members, firmware and schedules.

## What you get on StartOS

A **Web UI** interface serving the Proto Fleet dashboard. Proto Fleet reaches your miners over your local network, so the miners and your server need to be on the same network, or on networks that can reach each other.

## Getting set up

1. Run the **Set Admin Password** task. It creates the password for the `admin` account and shows it to you. Copy it somewhere safe.
2. Start Proto Fleet, open the **Web UI**, and sign in as `admin` with that password.
3. To add miners, choose **Enter network info manually** and give Proto Fleet your network's address range, for example `192.168.1.0/24`, or the IP addresses of your miners. Proto Fleet can't see your home network's range from inside StartOS, so its own guess points at an internal StartOS network and finds nothing.
4. Select the miners it finds and pair them. Some miners ask for their own web login during pairing.

## Using Proto Fleet

### Actions

- **Set Admin Password** — gives the `admin` account a new random password and shows it. Use it if you lose the password. It works whether Proto Fleet is running or stopped; when stopped, the new password takes effect at the next start. If you renamed the admin account inside Proto Fleet, the new password applies to that renamed account.
- **Performance Profile** — sizes the database and how hard Proto Fleet polls your miners. **Mini** (the default) suits up to about 200 miners on a server you share with other services. Choose **Standard** or **Max** only for a large fleet on a server with the memory to match. Proto Fleet restarts to apply it.

## Limitations

- Proto Fleet's own update prompt is turned off. Updates arrive as StartOS service updates.
- Finding miners by mDNS doesn't work on StartOS. Use an address range or a list of IP addresses.
