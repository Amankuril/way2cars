/** Routes in-app links from notifications (/trips/<id>, /profile/kyc, …) to screens. */
export function openLink(navigation, link) {
  if (!link) return;
  const trip = link.match(/^\/trips\/([a-f0-9]{24})/);
  if (trip) return navigation.navigate('Trip', { id: trip[1] });
  if (link.startsWith('/profile/kyc')) return navigation.navigate('Kyc');
  if (link.startsWith('/wallet')) return navigation.navigate('Wallet');
  const ticket = link.match(/^\/support\/([a-f0-9]{24})/);
  if (ticket) return navigation.navigate('Ticket', { id: ticket[1] });
}
