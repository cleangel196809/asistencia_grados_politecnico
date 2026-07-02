import unittest

from app.database import AttendanceStore


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.store = AttendanceStore()

    def test_role_aware_login_accepts_matching_role(self):
        user = self.store.validate_user("admin", "admin123", "ADMIN")
        self.assertIsNotNone(user)
        self.assertEqual(user["role"], "ADMIN")

    def test_role_aware_login_rejects_wrong_role(self):
        user = self.store.validate_user("admin", "admin123", "SCANNER")
        self.assertIsNone(user)


if __name__ == "__main__":
    unittest.main()
