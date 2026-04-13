import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature');
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret || !signature) {
      console.error('Missing secret or signature');
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Generate signature locally to verify
    const localSignature = crypto
      .createHmac('SHA256', channelSecret)
      .update(rawBody)
      .digest('base64');

    if (localSignature !== signature) {
      console.error('Invalid LINE signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const events = body.events;

    for (const event of events) {
      const source = event.source;
      
      console.log(`Received event type: ${event.type}`);
      
      if (source.type === 'group') {
        console.log('\n======================================================');
        console.log('🎉 EVENT FROM LINE GROUP!');
        console.log('GROUP ID:', source.groupId);
        console.log('Please copy this GROUP ID to your .env.local file');
        console.log('======================================================\n');
      } else if (source.type === 'room') {
        console.log('\n======================================================');
        console.log('🎉 EVENT FROM LINE ROOM!');
        console.log('ROOM ID:', source.roomId);
        console.log('Please copy this ROOM ID to your .env.local file');
        console.log('======================================================\n');
      } else {
        console.log('Event from user ID:', source.userId);
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error) {
    console.error('LINE Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
