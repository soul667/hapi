import unittest
from unittest.mock import patch
from pathlib import Path
import model_panel as m
class SwitchSafety(unittest.TestCase):
    def test_busy_sessions_are_not_stopped(self):
        for flags in [{'thinking':True},{'pendingRequestsCount':1},{'backgroundTaskCount':1},{'agentState':{'requests':{'pending':{}}}}]:
            with self.subTest(flags=flags),patch.object(m,'record_for',return_value=(Path('/unused'),{'agent':'zcode'})),patch.object(m,'choices',return_value=[{'value':'provider\\test','name':'test'}]),patch.object(m.subprocess,'run') as run:
                with self.assertRaisesRegex(ValueError,'当前任务'):
                    m.switch_model('test-busy','test',lambda *args:{'session':flags},'test')
                run.assert_not_called()
    def test_unknown_model_is_not_started(self):
        with patch.object(m,'record_for',return_value=(Path('/unused'),{'agent':'zcode'})),patch.object(m,'choices',return_value=[{'value':'provider\\test','name':'test'}]),patch.object(m.subprocess,'run') as run:
            with self.assertRaisesRegex(ValueError,'未提供'):m.switch_model('test-unknown','other',lambda *args:{},'test')
            run.assert_not_called()
if __name__=='__main__':unittest.main()
