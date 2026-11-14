"""Bit penanda piksel SPHEREx level-2 (dibaca dari header HDU FLAGS, MSKNnnnn)."""

TRANSIENT = 1 << 0
OVERFLOW = 1 << 1
SUR_ERROR = 1 << 2
NONFUNC = 1 << 6
MISSING_DATA = 1 << 9
HOT = 1 << 10
COLD = 1 << 11
NONLINEAR = 1 << 15
SOURCE = 1 << 21
STREAK = 1 << 25
BLOOM = 1 << 26
SNOWBALL = 1 << 27

# Piksel jenuh: sumber terlalu terang, nilai fluksnya tidak bisa dipercaya.
SATURATED = OVERFLOW | SUR_ERROR | NONLINEAR | BLOOM
# Piksel rusak karena detektor atau artefak, bukan karena langitnya.
BAD = NONFUNC | MISSING_DATA | HOT | COLD | STREAK | SNOWBALL | TRANSIENT
