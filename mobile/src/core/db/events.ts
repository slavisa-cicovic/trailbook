import mitt from 'mitt';

type DbEvents = {
  'trips:changed': void;
  'waypoints:changed': void;
  'waypointImages:changed': void;
  'segments:changed': void;
  'rawData:changed': void;
  'tripGroups:changed': void;
};

export const dbEvents = mitt<DbEvents>();
