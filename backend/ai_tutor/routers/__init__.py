from importlib import import_module

# Re-export individual router modules so they can be imported as attributes

sessions = import_module('.sessions', __name__)
folders = import_module('.folders', __name__)
tutor = import_module('.tutor', __name__)
tutor_ws = import_module('.tutor_ws', __name__)
board_summary = import_module('.board_summary', __name__) 