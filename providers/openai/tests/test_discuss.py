import unittest
from unittest.mock import patch
import httpx
from app.discuss import discuss

class ConversationTests(unittest.IsolatedAsyncioTestCase):
    async def test_history_and_instructions_reach_vendor(self):
        import json
        captured = []
        def handle(request):
            captured.append(json.loads(request.content))
            return httpx.Response(200,json={'output':[{'content':[{'text':'reply'}]}]})
        client = httpx.AsyncClient(transport=httpx.MockTransport(handle))
        history = [{'role':'user','content':'first'},{'role':'assistant','content':'reply'},{'role':'user','content':'second'}]
        with patch('app.discuss.load_api_key',return_value='test'), patch('app.discuss.httpx.AsyncClient',return_value=client):
            self.assertEqual(await discuss({'message':'second','messages':history,'instructions':'Be concise.','model':'test-model'}),'reply')
        self.assertEqual(captured[0]['input'],history)
        self.assertEqual(captured[0]['instructions'],'Be concise.')
