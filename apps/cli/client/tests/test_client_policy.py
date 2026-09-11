import asyncio
import unittest
from textual.widgets import Input
from src.app import ChatApp
from src.session import Session

class ClientPolicyTests(unittest.TestCase):
    def test_state_is_retained_and_stale_completion_ignored(self):
        session = Session()
        session.dispatch({'type':'app.boot'})
        session.dispatch({'type':'auth.completed','authenticated':True})
        session.dispatch({'type':'input.submitted','text':'Hello'})
        old = session.state['request_id']
        self.assertEqual(session.state['phase'], 'working')
        session.dispatch({'type':'request.cancel'})
        session.dispatch({'type':'request.completed','request_id':old,'reply':'late'})
        self.assertEqual(session.state['phase'], 'idle')
        self.assertFalse(session.state['messages'])

class InteractiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_message_history_error_and_recovery(self):
        calls = []
        async def backend(*args, params=None):
            if args[0] == 'auth': return {'authenticated':True}
            calls.append(params)
            if len(calls) == 2: raise RuntimeError('service unavailable')
            return {'reply':'A real test reply'}
        app = ChatApp(backend)
        async with app.run_test(size=(90,28)) as pilot:
            await pilot.pause()
            self.assertEqual(app.session.state['phase'], 'idle')
            prompt = app.query_one(Input)
            prompt.value = 'Hello'
            await pilot.press('enter')
            await pilot.pause()
            self.assertIn(('assistant','A real test reply'), app.transcript)
            prompt.value = 'Follow up'
            await pilot.press('enter')
            await pilot.pause()
            self.assertEqual([m['role'] for m in calls[1]['messages']], ['user','assistant','user'])
            self.assertEqual(app.session.state['phase'],'idle')
            self.assertIn(('system','service unavailable'),app.transcript)
            self.assertEqual(len(app.session.state['messages']),2)
            prompt.value = 'Try again'
            await pilot.press('enter')
            await pilot.pause()
            self.assertEqual(len(app.session.state['messages']),4)
            prompt.value = '/new'
            await pilot.press('enter')
            await pilot.pause()
            self.assertFalse(app.transcript)
            self.assertFalse(app.session.state['messages'])

    async def test_escape_cancels_without_exiting(self):
        cancelled = asyncio.Event()
        async def backend(*args, params=None):
            if args[0] == 'auth': return {'authenticated':True}
            try: await asyncio.Event().wait()
            finally: cancelled.set()
        app = ChatApp(backend)
        async with app.run_test() as pilot:
            await pilot.pause()
            app.query_one(Input).value = 'Wait for me'
            await pilot.press('enter')
            await pilot.pause()
            self.assertEqual(app.session.state['phase'],'working')
            self.assertIsNotNone(app.working_since)
            await pilot.press('escape')
            await pilot.pause()
            self.assertTrue(cancelled.is_set())
            self.assertEqual(app.session.state['phase'],'idle')
            self.assertIsNone(app.working_since)
            self.assertTrue(app.is_running)

    async def test_signed_out_help_and_reauthentication(self):
        count = 0
        async def backend(*args, params=None):
            nonlocal count
            count += 1
            return {'authenticated':count > 1}
        app = ChatApp(backend)
        async with app.run_test() as pilot:
            await pilot.pause()
            self.assertEqual(app.session.state['phase'],'signed_out')
            for text in ('hello','/?','/auth'):
                app.query_one(Input).value = text
                await pilot.press('enter')
                await pilot.pause()
            self.assertEqual(count,2)
            self.assertEqual(app.session.state['phase'],'idle')
            self.assertTrue(any('/new' in text for _,text in app.transcript))
            app.save_screenshot('/tmp/inpainter-cli.svg')
