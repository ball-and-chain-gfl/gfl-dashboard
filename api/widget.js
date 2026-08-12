// Friendly alias so the phone widget can just hit /api/widget
import handler from './espn.js';
export default function widget(req, res) {
  req.query = { ...req.query, type: 'widget' };
  return handler(req, res);
}
