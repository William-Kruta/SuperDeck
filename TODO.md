1. Recent Apps / Last Launched
   Add a small “Recent” row or make the last launched app easy to jump back to. For a living-room launcher, this matters more than full app management.
2. Per-App Launch State
   Show “Launching…”, “Active”, or “Failed” on the tile itself instead of only using toast messages. Useful when a command silently fails or takes a while.
3. Controller Input Debug Overlay
   A hidden debug panel showing last keyboard key, gamepad button index, axes, and selected tile. After the controller routing issues, this would save a lot of time.
4. Better Spatial Navigation
   Keep the current geometry-based navigation, but formalize it:
   - row detection
   - wrap rules
   - vertical nearest-tile behavior
   - maybe tests with mocked tile rects
5. Sleep / Quit / Restart Controls
   Add a system panel with actions like:
   - restart SuperDeck
   - sleep system
   - shutdown
   - restart Jellyfin
   - open logs
