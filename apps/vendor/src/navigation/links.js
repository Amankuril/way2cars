/** Routes notification links to host-app screens. */
export function openLink(navigation, link) {
  if (!link) return;
  const booking = link.match(/^\/bookings\/([a-f0-9]{24})/);
  if (booking) return navigation.navigate('Booking', { id: booking[1] });
  const vehicle = link.match(/^\/vehicles\/([a-f0-9]{24})/);
  if (vehicle) return navigation.navigate('Vehicle', { id: vehicle[1] });
  if (link.startsWith('/earnings')) return navigation.navigate('Main', { screen: 'Earnings' });
  const ticket = link.match(/^\/support\/([a-f0-9]{24})/);
  if (ticket) return navigation.navigate('Ticket', { id: ticket[1] });
  if (link.startsWith('/onboarding')) return navigation.navigate('Onboarding');
}
