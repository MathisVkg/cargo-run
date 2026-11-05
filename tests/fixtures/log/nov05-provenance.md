# November 5 real-log fixture

Derived by inspecting the actual local Star Citizen LIVE Game.log for the mission described in Task 06.2. Preserves genuine event strings and UTC timestamps: acceptance 18:24:01.549Z, pickup-state completion 18:29:56.806Z, delivery-state completion 18:37:35.607Z, mission completion 18:37:35.664Z and unattributed award 18:37:35.822Z (local Europe/Brussels +01:00).

Mission/template/objective UUIDs and player identifiers are substituted consistently. Positions, entity IDs and unrelated log records are omitted. The contract template indicates Corundum; the log does not state SCU quantities or readable pickup/destination names. Tests that combine it with OCR use explicitly synthetic quantities/routes. Marker and objective-state records supply identity evidence only, never loading or delivered quantities.
