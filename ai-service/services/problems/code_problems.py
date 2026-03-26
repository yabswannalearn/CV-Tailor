PROBLEMS = [
  # Easy
  {
    "id": 1, "title": "Two Sum", "difficulty": "Easy",
    "tags": ["Arrays", "Hash Map"],
    "description": "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target.",
    "examples": [
      {"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]"},
      {"input": "nums = [3,2,4], target = 6", "output": "[1,2]"},
    ],
    "constraints": ["2 <= nums.length <= 10^4", "Each input has exactly one solution"],
    "starter_code": "def two_sum(nums: list[int], target: int) -> list[int]:\n    pass\n\n# Test\nprint(two_sum([2,7,11,15], 9))",
  },
  {
    "id": 2, "title": "Reverse a String", "difficulty": "Easy",
    "tags": ["Strings"],
    "description": "Write a function that reverses a string without using slicing.",
    "examples": [
      {"input": '"hello"', "output": '"olleh"'},
    ],
    "constraints": ["Do not use [::-1]"],
    "starter_code": "def reverse_string(s: str) -> str:\n    pass\n\nprint(reverse_string('hello'))",
  },
  {
    "id": 3, "title": "FizzBuzz", "difficulty": "Easy",
    "tags": ["Loops"],
    "description": "Print numbers 1-n. For multiples of 3 print Fizz, multiples of 5 print Buzz, both print FizzBuzz.",
    "examples": [{"input": "n = 15", "output": "1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz"}],
    "constraints": ["1 <= n <= 100"],
    "starter_code": "def fizzbuzz(n: int):\n    pass\n\nfizzbuzz(15)",
  },
  {
    "id": 4, "title": "Valid Palindrome", "difficulty": "Easy",
    "tags": ["Strings", "Two Pointers"],
    "description": "Given a string, return True if it reads the same forward and backward (ignore case and non-alphanumeric).",
    "examples": [
      {"input": '"A man a plan a canal Panama"', "output": "True"},
      {"input": '"race a car"', "output": "False"},
    ],
    "constraints": ["Ignore spaces, punctuation, case"],
    "starter_code": "def is_palindrome(s: str) -> bool:\n    pass\n\nprint(is_palindrome('A man a plan a canal Panama'))",
  },
  {
    "id": 5, "title": "Count Vowels", "difficulty": "Easy",
    "tags": ["Strings"],
    "description": "Count the number of vowels in a string.",
    "examples": [{"input": '"hello world"', "output": "3"}],
    "constraints": ["Count a e i o u (case insensitive)"],
    "starter_code": "def count_vowels(s: str) -> int:\n    pass\n\nprint(count_vowels('hello world'))",
  },

  # Medium
  {
    "id": 6, "title": "Longest Substring Without Repeating", "difficulty": "Medium",
    "tags": ["Strings", "Sliding Window"],
    "description": "Given a string, find the length of the longest substring without repeating characters.",
    "examples": [
      {"input": '"abcabcbb"', "output": "3 (abc)"},
      {"input": '"bbbbb"', "output": "1"},
    ],
    "constraints": ["0 <= s.length <= 5*10^4"],
    "starter_code": "def length_of_longest_substring(s: str) -> int:\n    pass\n\nprint(length_of_longest_substring('abcabcbb'))",
  },
  {
    "id": 7, "title": "Valid Parentheses", "difficulty": "Medium",
    "tags": ["Stack", "Strings"],
    "description": "Given a string of brackets, return True if the brackets are valid (every open bracket has a matching close).",
    "examples": [
      {"input": '"()[]{}"', "output": "True"},
      {"input": '"(]"', "output": "False"},
    ],
    "constraints": ["Only ( ) [ ] { } characters"],
    "starter_code": "def is_valid(s: str) -> bool:\n    pass\n\nprint(is_valid('()[]{}}'))\nprint(is_valid('(]'))",
  },
  {
    "id": 8, "title": "Flatten Nested List", "difficulty": "Medium",
    "tags": ["Recursion", "Lists"],
    "description": "Given a nested list, flatten it into a single list.",
    "examples": [
      {"input": "[[1,2],[3,[4,5]],6]", "output": "[1,2,3,4,5,6]"},
    ],
    "constraints": ["Arbitrary nesting depth"],
    "starter_code": "def flatten(lst: list) -> list:\n    pass\n\nprint(flatten([[1,2],[3,[4,5]],6]))",
  },
  {
    "id": 9, "title": "Group Anagrams", "difficulty": "Medium",
    "tags": ["Arrays", "Hash Map", "Strings"],
    "description": "Given a list of strings, group the anagrams together.",
    "examples": [
      {"input": '["eat","tea","tan","ate","nat","bat"]', "output": '[["eat","tea","ate"],["tan","nat"],["bat"]]'},
    ],
    "constraints": ["All strings are lowercase"],
    "starter_code": "def group_anagrams(strs: list[str]) -> list[list[str]]:\n    pass\n\nprint(group_anagrams(['eat','tea','tan','ate','nat','bat']))",
  },
  {
    "id": 10, "title": "Binary Search", "difficulty": "Medium",
    "tags": ["Arrays", "Binary Search"],
    "description": "Implement binary search. Return the index of target in a sorted array, or -1 if not found.",
    "examples": [
      {"input": "nums = [-1,0,3,5,9,12], target = 9", "output": "4"},
      {"input": "nums = [-1,0,3,5,9,12], target = 2", "output": "-1"},
    ],
    "constraints": ["Array is sorted ascending", "No duplicates"],
    "starter_code": "def binary_search(nums: list[int], target: int) -> int:\n    pass\n\nprint(binary_search([-1,0,3,5,9,12], 9))\nprint(binary_search([-1,0,3,5,9,12], 2))",
  },

  # Hard
  {
    "id": 11, "title": "Longest Common Subsequence", "difficulty": "Hard",
    "tags": ["Dynamic Programming", "Strings"],
    "description": "Given two strings, return the length of their longest common subsequence.",
    "examples": [
      {"input": 'text1 = "abcde", text2 = "ace"', "output": "3"},
    ],
    "constraints": ["1 <= text.length <= 1000"],
    "starter_code": "def lcs(text1: str, text2: str) -> int:\n    pass\n\nprint(lcs('abcde', 'ace'))",
  },
  {
    "id": 12, "title": "Word Break", "difficulty": "Hard",
    "tags": ["Dynamic Programming", "Strings"],
    "description": "Given a string and a dictionary, return True if the string can be segmented into dictionary words.",
    "examples": [
      {"input": 's = "leetcode", wordDict = ["leet","code"]', "output": "True"},
      {"input": 's = "applepenapple", wordDict = ["apple","pen"]', "output": "True"},
    ],
    "constraints": ["1 <= s.length <= 300"],
    "starter_code": "def word_break(s: str, word_dict: list[str]) -> bool:\n    pass\n\nprint(word_break('leetcode', ['leet','code']))",
  },
  {
    "id": 13, "title": "LRU Cache", "difficulty": "Hard",
    "tags": ["Design", "Hash Map", "Linked List"],
    "description": "Design a data structure that follows the Least Recently Used cache eviction policy.",
    "examples": [
      {"input": "LRUCache(2) → put(1,1) → put(2,2) → get(1) → put(3,3) → get(2)", "output": "1, -1"},
    ],
    "constraints": ["capacity >= 1", "O(1) get and put"],
    "starter_code": "class LRUCache:\n    def __init__(self, capacity: int):\n        pass\n\n    def get(self, key: int) -> int:\n        pass\n\n    def put(self, key: int, value: int) -> None:\n        pass\n\ncache = LRUCache(2)\ncache.put(1,1)\ncache.put(2,2)\nprint(cache.get(1))\ncache.put(3,3)\nprint(cache.get(2))",
  },
  {
    "id": 14, "title": "Serialize and Deserialize Binary Tree", "difficulty": "Hard",
    "tags": ["Trees", "Design", "Recursion"],
    "description": "Design an algorithm to serialize and deserialize a binary tree.",
    "examples": [
      {"input": "root = [1,2,3,null,null,4,5]", "output": "[1,2,3,null,null,4,5]"},
    ],
    "constraints": ["The encoded string should be decodable back to the original tree"],
    "starter_code": "class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right\n\ndef serialize(root) -> str:\n    pass\n\ndef deserialize(data: str):\n    pass",
  },
  {
    "id": 15, "title": "Trapping Rain Water", "difficulty": "Hard",
    "tags": ["Arrays", "Two Pointers", "Dynamic Programming"],
    "description": "Given n non-negative integers representing an elevation map, compute how much water it can trap after rain.",
    "examples": [
      {"input": "height = [0,1,0,2,1,0,1,3,2,1,2,1]", "output": "6"},
    ],
    "constraints": ["n == height.length", "0 <= height[i] <= 10^5"],
    "starter_code": "def trap(height: list[int]) -> int:\n    pass\n\nprint(trap([0,1,0,2,1,0,1,3,2,1,2,1]))",
  },
]

def get_all_problems():
    return [{"id": p["id"], "title": p["title"], "difficulty": p["difficulty"], "tags": p["tags"]} for p in PROBLEMS]

def get_problem_by_id(problem_id: int):
    return next((p for p in PROBLEMS if p["id"] == problem_id), None)