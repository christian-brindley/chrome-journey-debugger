# chrome-journey-debugger

Debugger for PingOne Advanced Identity Cloud journeys

## Warning

This is an experimental chrome debugger extension for inspecting user journeys in PingOne Advanced Identity Cloud. Caveats when installing and using this extension are

- It is completely unsupported
- It is experimental and buggy
- It can only be installed in developer mode
- It has access to all your network traffic
- Not for use against a production environment

## Installation

Clone this repo, then

- Go to chrome://extensions
- Enable developer mode
- Click "Load unpacked"
- Select the repo directory you just cloned to
- Once installed, pin the extension to make it easy to get to settings

[Watch the video](videos/journey-debugger-install.mov)

## Configuration

You need to add an entry for every backend tenant hostname you want to debug. To do this, click the pinned extension icon in the browser toolbar, and select Settings. Click the three dots by "Target Hosts" to add a new host with the following details

- Fully qualified hostname (no https:// or path) - e.g. `openam-demo.forgeblocks.com`
- Log API key and secret generated from the admin UI

Note that the hostname is that of the backend tenant, where the `/authenticate` endpoint is hosted, rather than e.g. a custom login UI frontend hostname.

## Use

When enabling the developer tools in Chrome, there is a new tab called "Journey Debugger". This will only appear when you are on a web page - not when you are on a Chrome builtin page.

This tab shows details for each request sent to the `/authenticate` endpoint.

## Known issues

- There doesn't seem to be any way to feed back search result data to the standard Chrome search dialogue (Cmd-F). You can still use Cmd-F/Cmd-G/Shift-Cmd-G shortcuts, but it's awkward, so there is a separate search control in the extension.
- It's not always clear whether you have all the logs for a given transaction: in automatic mode, you sometimes you need to force an additional log fetch (using the refresh button) to get the last records.
