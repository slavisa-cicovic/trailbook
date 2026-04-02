import { placeholderTrips } from "../../../domain/trips";

export function TripsListView() {
  return (
    <main>
      <h1>Trailbook</h1>
      <p>Trip history review scaffold.</p>
      <ul>
        {placeholderTrips.map((trip) => (
          <li key={trip.id}>
            <strong>{trip.id}</strong>
            {" | "}
            {trip.startedAt}
            {" | "}
            {trip.distanceMeters} m
          </li>
        ))}
      </ul>
    </main>
  );
}
